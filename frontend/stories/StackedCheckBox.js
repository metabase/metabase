import { React, Centered, storiesOf, action, linkTo } from ".";

import StackedCheckBox from "metabase/components/StackedCheckBox.jsx";

storiesOf("StackedCheckBox", module)
    .add("on inverted", () =>
        <Centered><StackedCheckBox style={{ color: "#509EE3" }} invertChecked checked={true} onChange={linkTo("StackedCheckBox", "off")} /></Centered>
    )
    .add("off", () =>
        <Centered><StackedCheckBox checked={false} onChange={linkTo("StackedCheckBox", "on inverted")} /></Centered>
    )
    .add("on", () =>
        <Centered><StackedCheckBox checked={true} onChange={action("onChange")} /></Centered>
    )
