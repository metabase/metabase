import React from "react";
import styled from "styled-components";
import * as systemExports from "styled-system";
import * as gridExports from "grid-styled";
import colors, * as colorsExports from "metabase/lib/colors";
import * as entities from "metabase/entities";
import COMPONENTS from "./components-webpack";

const context = {
  ...systemExports,
  ...gridExports,
  ...colorsExports,
  React,
  styled,
  colors,
};

// components with .info.js files
for (const { component } of COMPONENTS) {
  context[component.displayName || component.name] = component;
}

// Metabase's entities, capitalized
import { capitalize } from "metabase/lib/formatting";
for (const [name, entity] of Object.entries(entities)) {
  context[capitalize(name)] = entity;
}

export default context;
