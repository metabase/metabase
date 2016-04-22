import { React, Centered, storiesOf, action, linkTo } from ".";

import CheckBox from "metabase/components/CheckBox.jsx";

storiesOf("CheckBox", module)
    .add("on inverted", () =>
        <Centered><CheckBox style={{ color: "#509EE3" }} invertChecked checked={true} onChange={linkTo("CheckBox", "off")} /></Centered>
    )
    .add("off", () =>
        <Centered><CheckBox checked={false} onChange={linkTo("CheckBox", "on inverted")} /></Centered>
    )
    .add("on", () =>
        <Centered><CheckBox checked={true} onChange={action("onChange")} /></Centered>
    )
