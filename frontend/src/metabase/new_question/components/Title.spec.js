import React from "react";
import renderer from "react-test-renderer";

import Title from "./Title";

describe("Title", () => {
    it("should render correctly", () => {
        const tree = renderer
            .create(<Title>Hey it's me the title</Title>)
            .toJSON();
        expect(tree).toMatchSnapshot();
    });
});
