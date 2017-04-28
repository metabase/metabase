import React from "react";
import PropTypes from "prop-types";
import { render, Artboard, Text, View } from "react-sketchapp";

// import all modules in this directory (http://stackoverflow.com/a/31770875)
const req = require.context(
    "../../src/metabase/components",
    true,
    /^(.*\.info\.(js$))[^.]*$/igm
);

const components = req.keys().map(key => {
    try {
        return req(key);
    } catch (e) {
        console.log("ERROR=" + e);
        return {};
    }
});

const Document = ({ colors }) => {
    return (
        <Artboard
            name="Swatches"
            style={{
                flexDirection: "row",
                flexWrap: "wrap",
                width: (96 + 8) * 4
            }}
        >
            {components
                .filter(component => component.universal && component.examples)
                .map(component => (
                    <View style={{ margin: 10 }}>
                        {Object.entries(component.examples).map(([name, example]) =>
                            <View style={{ margin: 5 }}>
                                {example}
                            </View>
                        )}
                    </View>
                ))}
        </Artboard>
    );
};

Document.propTypes = {
};

export default context => {
    render(<Document />, context.document.currentPage());
};
