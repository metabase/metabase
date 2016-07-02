import { React, Centered, storiesOf, action, linkTo } from ".";

import Toggle from "metabase/components/Toggle.jsx";

storiesOf("Toggle", module)
    .add("on", () =>
        <Centered><Toggle value={true} onChange={linkTo("Toggle", "off")} /></Centered>
    )
    .add("off", () =>
        <Centered><Toggle value={false} onChange={linkTo("Toggle", "on")} /></Centered>
    )
