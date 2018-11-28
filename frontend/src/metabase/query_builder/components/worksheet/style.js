import { t } from "c-3po";
import colors from "metabase/lib/colors";

const SECTIONS = {
  data: {
    name: t`Data`,
    icon: "table2",
    color: colors["brand"],
  },
  filter: {
    name: t`Filter`,
    icon: "funnel",
    color: colors["accent2"],
  },
  summarize: {
    name: t`Summarize`,
    icon: "sum",
    color: colors["accent1"],
  },
  preview: {
    name: t`Preview`,
    icon: "eye",
    color: colors["text-medium"],
  },
};

export default SECTIONS;
