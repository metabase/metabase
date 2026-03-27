import type { CreateCustomVisualizationProps } from "custom-viz/src/types/viz";
import { t } from "ttag";

import type { OptionsType } from "metabase/lib/formatting/types";
import { formatValue as internalFormatValue } from "metabase/lib/formatting/value";
import type {
  FontStyle,
  TextMeasurer,
} from "metabase/visualizations/shared/types/measure-text";
import * as isa from "metabase-lib/v1/types/utils/isa";

type TextWidthMeasurer = (text: string, style: FontStyle) => number;
type TextHeightMeasurer = (text: string, style: FontStyle) => number;

interface BuildCustomVizPropsOptions {
  locale: string;
  measureText: TextMeasurer;
  measureTextWidth: TextWidthMeasurer;
  measureTextHeight: TextHeightMeasurer;
  getAssetUrl: (assetPath: string) => string;
}

export function buildCustomVizProps(
  opts: BuildCustomVizPropsOptions,
): CreateCustomVisualizationProps {
  return {
    locale: opts.locale,
    translate: (text: string) => t`${text}`,
    columnTypes: {
      isDate: isa.isDate,
      isNumeric: isa.isNumeric,
      isInteger: isa.isInteger,
      isBoolean: isa.isBoolean,
      isString: isa.isString,
      isStringLike: isa.isStringLike,
      isSummable: isa.isSummable,
      isNumericBaseType: isa.isNumericBaseType,
      isDateWithoutTime: isa.isDateWithoutTime,
      isNumber: isa.isNumber,
      isFloat: isa.isFloat,
      isTime: isa.isTime,
      isFK: isa.isFK,
      isPK: isa.isPK,
      isEntityName: isa.isEntityName,
      isTitle: isa.isTitle,
      isProduct: isa.isProduct,
      isSource: isa.isSource,
      isAddress: isa.isAddress,
      isScore: isa.isScore,
      isQuantity: isa.isQuantity,
      isCategory: isa.isCategory,
      isAny: isa.isAny,
      isState: isa.isState,
      isCountry: isa.isCountry,
      isCoordinate: isa.isCoordinate,
      isLatitude: isa.isLatitude,
      isLongitude: isa.isLongitude,
      isCurrency: isa.isCurrency,
      isPercentage: isa.isPercentage,
      isID: isa.isID,
      isURL: isa.isURL,
      isEmail: isa.isEmail,
      isAvatarURL: isa.isAvatarURL,
      isImageURL: isa.isImageURL,
      hasLatitudeAndLongitudeColumns: isa.hasLatitudeAndLongitudeColumns,
    },
    formatValue: (value, options) => {
      const result = internalFormatValue(value, {
        ...(options as OptionsType),
        jsx: false,
      });
      return String(result ?? "");
    },
    getAssetUrl: opts.getAssetUrl,
    measureText: opts.measureText,
    measureTextWidth: opts.measureTextWidth,
    measureTextHeight: opts.measureTextHeight,
  };
}
