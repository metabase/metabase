import React from "react";
import styled from "@emotion/styled";
import * as systemExports from "styled-system";
import colors, * as colorsExports from "metabase/lib/colors";
import * as entities from "metabase/entities";
import COMPONENTS from "./components-webpack";

const context = {
  ...systemExports,
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
