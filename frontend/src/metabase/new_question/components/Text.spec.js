import React from "react";
import renderer from "react-test-renderer";

import Text from "./Text";

describe("Text", () => {
    it("should render correctly", () => {
        const tree = renderer
            .create(<Text>Why hey here's some body text</Text>)
            .toJSON();

        expect(tree).toMatchSnapshot();
    });
});
