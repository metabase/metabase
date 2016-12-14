import React, { Component } from "react";

import HeaderWithBack from "metabase/components/HeaderWithBack";
import EntityList from "./EntityList";

export default class Archive extends Component {
    render () {
        return (
            <div className="px4 pt3">
                <div className="flex align-center">
                    <HeaderWithBack name="Archive" />
                </div>
                <EntityList query={{ f: "archived" }} />
            </div>
        );
    }
}
