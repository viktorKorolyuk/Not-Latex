const fs = require("fs");
const p = console.log;
const fm = require("front-matter");
const markdown = require("markdown").markdown;
const mj = require("mathjax-node");
const cheerio = require("cheerio");
const InlineMath = new RegExp(/\${(.+)}\$/, "g");

const {
    exec
} = require("child_process");

var settings = {};
var blockMath = [];



function fsReadPromise(file) {
    return new Promise((req, rej) => {
        fs.readFile(file, "utf8", function (err, data) {
            if (err) rej();
            req(data);
        });
    });
}

function mjConvertSync(options) {
    return new Promise((req, rej) => {
        mj.typeset(options, function (data) {
            if (!data.err) req(data);
            rej();
        });
    });
};


function processMarkdown(md, callback = function () {}) {
    x = markdown.renderJsonML(md);
    $ = cheerio.load(x);

    Setup: {
        $("head").append(`<title>${settings.title}</title>`);
        $("head").append(`<link rel="stylesheet" href="${settings.stylesheet}">`);
        $("body").prepend(`<div class="title"><h1>${settings.title}</h1><h2>${settings.author}</h2></div>`);

        // Remove all horizontal lines
        $("hr").each(function () {
            $(this).remove()
        });
    }

    MathBlock: {
        // Process all inline math-objects.
        // Replaces all ${<math goeth here>}$.
        var manipulate = $.html();
        result = InlineMath.exec(manipulate);

        new Promise(async (req, res) => {
            do {
                if (result && result[1]) {
                    await mjConvertSync({
                        math: result[1],
                        format: "inline-TeX",
                        mml: true
                    }).then(e => {
                        manipulate = manipulate.replace(`\$\{${result[1]}\}\$`, e.mml);
                    });
                    result = InlineMath.exec($.html());
                }
                if (!result) {
                    req();
                }
            } while (result);
        }).then(e => {

            $ = $.load(manipulate);
        }).then(e => {

            // Fill all blocks
            return changeMathBlock($);
        }).then(e => {
            callback($.html());
        }).catch(err => {
            console.log(err)
        });
    }
}

function changeMathBlock($) {
    codeblocks = [];

    $("code").each(function () {
        x = /^[\w]+/.exec($(this).text());

        // If NULL return.
        if (!x) return;
        $(this).addClass(x[0]);
        $(this).html($(this).html().replace(x[0], ""));
        if (x[0] === "math") codeblocks.push(this);
    });

    if (codeblocks.length === 0) return;

    return new Promise((res, rej) => {
        codeblocks.forEach(async function (elem, index) {
            await mjConvertSync({
                math: $(elem).text(),
                format: "TeX",
                mml: true
            }).then(e => {
                $(elem).html(e.mml);

                // If is is the last element, run callback.
                if (index + 1 == codeblocks.length) {

                    res();
                }
            });
        })

    });
}

// Throws "funny" error when file argument is not provided
if (!process.argv[2]) throw "Wtf dude";

mj.config({
    MathJax: {}
});

// Start MathJax
mj.start();

// Read first argument
fsReadPromise(process.argv[2]).then(e => {
    settings = fm(e).attributes;

    var obj = markdown.toHTMLTree(e);
    var argv = process.argv[2].split(".")
    argv.pop();
    processMarkdown(obj, function (result) {
        fs.writeFileSync(argv.join("") + ".html", result);
    });

}).catch(e => {
    console.log("Something went wrong", e);
});