import React from "react";

import Button from "metabase/components/Button";
import Input from "metabase/components/Input";

const NewCollection = () =>
    <div className="wrapper wrapper--trim">
        <h3>New collection</h3>
        <div>
            <Input className="input full" />
        </div>
        <div>
            <Input className="input full" />
        </div>
        <Button />
    </div>

export default NewCollection;
