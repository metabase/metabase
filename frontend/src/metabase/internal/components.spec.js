import renderer from "react-test-renderer";

import components from "./lib/components-node";

// generates a snapshot test for every example in every component's `.info.js`
components.map(({ component, examples }) =>
    describe(component.displayName, () => {
        Object.entries(examples).map(([exampleName, element]) =>
            it(`should render "${exampleName}" correctly`, () => {
                expect(renderer.create(element).toJSON()).toMatchSnapshot();
            }));
    }));
