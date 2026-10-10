/// <reference lib="dom" />
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import type { Series } from "../types/data";
import type {
  ClickObject,
  CreateCustomVisualization,
  CustomVisualization,
  HoverObject,
} from "../types/viz";
import type {
  BaseVisualizationSettings,
  CreateDefineSetting,
  CustomVisualizationSettingDefinition,
  CustomVisualizationSettings,
} from "../types/viz-settings";

import {
  type ColorScheme,
  assertKnownColorVariables,
  createGetColor,
  installMockHost,
  measureText,
} from "./mock-host";

export type VizOptions<TSettings extends BaseVisualizationSettings> = {
  series: Series;
  settings?: Partial<TSettings>;
};

export type RenderVizOptions<TSettings extends BaseVisualizationSettings> =
  VizOptions<TSettings> & {
    colorScheme?: ColorScheme;
    width?: number;
    height?: number;
  };

type SettingResolvers = {
  getValue?: (series: Series, settings: object) => unknown;
  isValid?: (series: Series, settings: object) => boolean;
  getDefault?: (series: Series, settings: object) => unknown;
};

const isSettingDefinition = <TSettings extends BaseVisualizationSettings>(
  value: unknown,
): value is CustomVisualizationSettingDefinition<TSettings> =>
  typeof value === "object" && value !== null;

const isSettingResolvers = (value: unknown): value is SettingResolvers =>
  typeof value === "object" && value !== null;

const isSettings = <TSettings extends BaseVisualizationSettings>(
  value: object,
): value is CustomVisualizationSettings<TSettings> => value !== null;

const createViz = <TSettings extends BaseVisualizationSettings>(
  create: CreateCustomVisualization<TSettings>,
): CustomVisualization<TSettings> => {
  const defineSetting: ReturnType<CreateDefineSetting<TSettings>> = (
    definition,
  ) => {
    if (!isSettingDefinition<TSettings>(definition)) {
      throw new Error("defineSetting expects an object");
    }
    return definition;
  };
  return create({ defineSetting, locale: "en" });
};

const resolveSettings = <TSettings extends BaseVisualizationSettings>(
  viz: CustomVisualization<TSettings>,
  { series, settings = {} }: VizOptions<TSettings>,
): CustomVisualizationSettings<TSettings> => {
  const stored: Record<string, unknown> = settings;
  const resolved: Record<string, unknown> = { ...stored, column: () => ({}) };
  Object.entries(viz.settings ?? {}).forEach(([id, definition]) => {
    if (!isSettingResolvers(definition)) {
      return;
    }
    const { getValue, isValid, getDefault } = definition;
    if (getValue) {
      resolved[id] = getValue(series, resolved);
    } else if (
      stored[id] !== undefined &&
      (!isValid || isValid(series, resolved))
    ) {
      resolved[id] = stored[id];
    } else {
      resolved[id] = getDefault?.(series, resolved);
    }
  });
  if (!isSettings<TSettings>(resolved)) {
    throw new Error("settings must be an object");
  }
  return resolved;
};

export const checkViz = <TSettings extends BaseVisualizationSettings>(
  create: CreateCustomVisualization<TSettings>,
  options: VizOptions<TSettings>,
) => {
  installMockHost();
  const viz = createViz(create);
  const settings = resolveSettings(viz, options);
  viz.checkRenderable?.(options.series, settings);
  return { viz, settings };
};

const dispatchMouse = (
  element: Element,
  type: string,
  relatedTarget?: Element,
) =>
  act(() => {
    element.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, relatedTarget }),
    );
  });

export const renderViz = <TSettings extends BaseVisualizationSettings>(
  create: CreateCustomVisualization<TSettings>,
  {
    colorScheme = "light",
    width = 600,
    height = 400,
    ...options
  }: RenderVizOptions<TSettings>,
) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const { viz, settings } = checkViz(create, options);
  const { VisualizationComponent } = viz;
  const hovers: (HoverObject | null | undefined)[] = [];
  const clicks: (ClickObject | null)[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <VisualizationComponent
        width={width}
        height={height}
        series={options.series}
        settings={settings}
        renderingContext={{
          getColor: createGetColor(colorScheme),
          measureText,
          fontFamily: "Lato",
          colorScheme,
        }}
        onClick={(clickObject) => clicks.push(clickObject)}
        onHover={(hoverObject) => hovers.push(hoverObject)}
      />,
    );
  });
  assertKnownColorVariables(container.innerHTML);

  const hover = (element: Element) => {
    dispatchMouse(element, "mouseover", document.body);
    dispatchMouse(element, "mousemove");
    return hovers[hovers.length - 1];
  };

  const leave = (element: Element) => {
    dispatchMouse(element, "mouseout", document.body);
    return hovers[hovers.length - 1];
  };

  const click = (element: Element) => {
    dispatchMouse(element, "click");
    return clicks[clicks.length - 1];
  };

  const elements = () => Array.from(container.querySelectorAll("*"));

  const findHoverableMarks = () =>
    elements().filter((element) => {
      const count = hovers.length;
      hover(element);
      const hovered = hovers.slice(count).some((hoverObject) => hoverObject);
      leave(element);
      return hovered;
    });

  const findClickableMarks = () =>
    elements().filter((element) => {
      const count = clicks.length;
      click(element);
      return clicks.slice(count).some((clickObject) => clickObject);
    });

  const unmount = () => {
    act(() => root.unmount());
    container.remove();
  };

  return {
    container,
    settings,
    hovers,
    clicks,
    hover,
    leave,
    click,
    findHoverableMarks,
    findClickableMarks,
    unmount,
  };
};
