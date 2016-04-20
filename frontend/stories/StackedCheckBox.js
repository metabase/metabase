import { React, Centered, storiesOf, action } from ".";

import StackedCheckBox from "metabase/components/StackedCheckBox.jsx";

storiesOf("StackedCheckBox", module)
    .add("on", () =>
        <Centered><StackedCheckBox checked={true} onChange={action("onChange")} /></Centered>
    )
    .add("off", () =>
        <Centered><StackedCheckBox checked={false} onChange={action("onChange")} /></Centered>
    )
    .add("on inverted", () =>
        <Centered><StackedCheckBox style={{ color: "#509EE3" }} invertChecked checked={true} onChange={action("onChange")} /></Centered>
    )
