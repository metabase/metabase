import { React, Centered, storiesOf, action } from ".";

import CheckBox from "metabase/components/CheckBox.jsx";

storiesOf("CheckBox", module)
    .add("on", () =>
        <Centered><CheckBox checked={true} onChange={action("onChange")} /></Centered>
    )
    .add("off", () =>
        <Centered><CheckBox checked={false} onChange={action("onChange")} /></Centered>
    )
    .add("on inverted", () =>
        <Centered><CheckBox style={{ color: "#509EE3" }} invertChecked checked={true} onChange={action("onChange")} /></Centered>
    )
