import { React, Centered, storiesOf, action } from ".";

import Toggle from "metabase/components/Toggle.jsx";

storiesOf("Toggle", module)
    .add("on", () =>
        <Centered><Toggle value={true} onChange={action("onChange")} /></Centered>
    )
    .add("off", () =>
        <Centered><Toggle value={false} onChange={action("onChange")} /></Centered>
    )
