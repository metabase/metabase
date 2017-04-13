import React from "react";
import { Route, IndexRoute } from "react-router";

import IconsApp from "metabase/internal/components/IconsApp";
import ColorsApp from "metabase/internal/components/ColorsApp";
import ComponentsApp from "metabase/internal/components/ComponentsApp";

const PAGES = {
    "Icons": IconsApp,
    "Colors": ColorsApp,
    "Components": ComponentsApp,
}

const ListApp = () =>
    <ul>
        { Object.keys(PAGES).map((name) =>
            <li><a href={"/_internal/"+name.toLowerCase()}>{name}</a></li>
        )}
    </ul>



export default (
    <Route>
        <IndexRoute component={ListApp} />
        { Object.entries(PAGES).map(([name, Component]) =>
            <Route path={name.toLowerCase()} component={Component} />
        )}
    </Route>
);
