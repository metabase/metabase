(function() {
    var scriptUrl;
    try {
        throw new Error();
    } catch (e) {
        scriptUrl = e.stack.match(
            /https?:\/\/[\w_-]+(\.[\w_-]+)*(\:\d+)?\/[^:\s]+\.js/
        )[0];
    }

    var scripts = document.getElementsByTagName("script");
    var script;
    for (var i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src === scriptUrl) {
            script = scripts[i];
            break;
        }
    }

    var iframeAttrsMap = {
        width: "800",
        height: "600",
        frameborder: "0",
        allowtransparency: "allowtransparency"
    };
    var hashParamsMap = {};

    if (script) {
        for (var name in script.dataset) {
            if (name in iframeAttrsMap) {
                iframeAttrsMap[name] = script.dataset[name];
            } else {
                hashParamsMap[name] = script.dataset[name];
            }
        }
    }

    var hashParamsStr = Object.keys(hashParamsMap)
        .map(function(name) {
            return name + "=" + hashParamsMap[name];
        })
        .join("&");

    iframeAttrsMap["src"] = scriptUrl.replace(/\.js$/, "") + (hashParamsStr ? "#" + hashParamsStr : "");
    iframeAttrsMap["onload"] = "iFrameResize({}, this)";

    var iframeAttrs = Object.keys(iframeAttrsMap)
        .map(function(name) {
            return name + "=" + JSON.stringify(iframeAttrsMap[name]);
        })
        .join(" ");

    if (!window.iFrameResize) {
        document.write(
            '<script src="node_modules/iframe-resizer/js/iframeResizer.js" charset="utf-8"></script>'
        );
    }

    console.log("iframeAttrs", iframeAttrs)

    document.write('<iframe ' + iframeAttrs + '></iframe>');
})();
