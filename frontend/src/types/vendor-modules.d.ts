// Module declarations for third-party packages that don't have proper type exports
// for bundler moduleResolution or tsgo compatibility

// echarts internal modules (not publicly exported)
declare module "echarts/types/src/util/types" {
  export type OptionSourceData = any;
  export type LabelOption = any;
  export type LabelLayoutOptionCallback = any;
  export type LabelLayoutOptionCallbackParams = any;
  export type SeriesLabelOption = any;
  export * from "echarts";
}

declare module "echarts/types/src/coord/axisCommonTypes" {
  export type AxisBaseOption = any;
  export type AxisBaseOptionCommon = any;
  export type OptionAxisType = any;
}

declare module "echarts/types/src/component/marker/MarkLineModel" {
  export type MarkLine1DDataItemOption = any;
  export type MarkLine2DDataItemOption = any;
}

declare module "echarts/types/src/component/brush/BrushModel" {
  export type BrushAreaParam = any;
}

// zrender internal module
declare module "zrender/lib/core/types" {
  export type ElementEvent = any;
  export type ZRRawMouseEvent = any;
}

// CodeMirror modules with CJS-only exports
declare module "@codemirror/lang-json" {
  export function json(): any;
  export function jsonParseLinter(): any;
}

declare module "@codemirror/legacy-modes/mode/clojure" {
  export const clojure: any;
}

declare module "@codemirror/legacy-modes/mode/pug" {
  export const pug: any;
}

declare module "@codemirror/legacy-modes/mode/ruby" {
  export const ruby: any;
}

// Redux Toolkit internal module
declare module "@reduxjs/toolkit/src/query/react/buildHooks" {
  export type UseQuery<T> = () => { data?: T; isLoading: boolean; error?: any };
  export type TypedUseLazyQuery<
    TResult = unknown,
    TArg = unknown,
    _BaseQuery = unknown,
  > = () => [
    (
      args?: TArg,
    ) => Promise<{ data?: TResult; error?: any }> & { abort: () => void },
    { data?: TResult; isLoading: boolean; error?: any },
  ];
}
