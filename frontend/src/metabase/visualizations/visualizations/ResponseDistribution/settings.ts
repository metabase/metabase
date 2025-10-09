import { t } from "ttag";

import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { Series, VisualizationSettings } from "metabase-types/api";

export const RESPONSE_DISTRIBUTION_SETTINGS = {
  "response_distribution.question_title_column": {
    ...fieldSetting("response_distribution.question_title_column", {
      fieldFilter: () => true, // Allow any column type for title
    })["response_distribution.question_title_column"],
    get section() {
      return t`Data`;
    },
    get title() {
      return t`Question title column`;
    },
    get description() {
      return t`Column containing the question title to display`;
    },
  },

  "response_distribution.option_text_column": {
    ...fieldSetting("response_distribution.option_text_column", {
      fieldFilter: () => true, // Allow any column type for text
    })["response_distribution.option_text_column"],
    get section() {
      return t`Data`;
    },
    get title() {
      return t`Option text column`;
    },
    get description() {
      return t`Column containing the option text/labels`;
    },
  },

  "response_distribution.option_weight_column": {
    ...fieldSetting("response_distribution.option_weight_column", {
      fieldFilter: (col) => isNumeric(col),
    })["response_distribution.option_weight_column"],
    get section() {
      return t`Data`;
    },
    get title() {
      return t`Option weight column`;
    },
    get description() {
      return t`Column containing the weight for each option (required for calculating the overall score)`;
    },
  },

  "response_distribution.response_count_column": {
    ...fieldSetting("response_distribution.response_count_column", {
      fieldFilter: (col) => isNumeric(col),
    })["response_distribution.response_count_column"],
    get section() {
      return t`Data`;
    },
    get title() {
      return t`Response count column`;
    },
    get description() {
      return t`Column containing the number of responses for each option`;
    },
  },

  "response_distribution.total_responses_column": {
    ...fieldSetting("response_distribution.total_responses_column", {
      fieldFilter: (col) => isNumeric(col),
    })["response_distribution.total_responses_column"],
    get section() {
      return t`Data`;
    },
    get title() {
      return t`Total responses column`;
    },
    get description() {
      return t`Column containing the total number of responses`;
    },
  },

  "response_distribution.is_cna_column": {
    ...fieldSetting("response_distribution.is_cna_column", {
      fieldFilter: () => true, // Can be boolean, number, or string
    })["response_distribution.is_cna_column"],
    get section() {
      return t`Data`;
    },
    get title() {
      return t`CNA indicator column`;
    },
    get description() {
      return t`Column indicating if the option is "Choose Not to Answer"`;
    },
  },

  "response_distribution.use_custom_order": {
    get section() {
      return t`Display`;
    },
    get title() {
      return t`Use custom order`;
    },
    get description() {
      return t`Sort options by a specific order column`;
    },
    widget: "toggle",
    default: false,
  },

  "response_distribution.option_order_column": {
    ...fieldSetting("response_distribution.option_order_column", {
      fieldFilter: (col) => isNumeric(col),
    })["response_distribution.option_order_column"],
    get section() {
      return t`Display`;
    },
    get title() {
      return t`Order column`;
    },
    get description() {
      return t`Column containing numeric values for sorting options (CNA always appears last)`;
    },
    getHidden: (series: Series, settings: VisualizationSettings) => {
      return !settings["response_distribution.use_custom_order"];
    },
  },
};
