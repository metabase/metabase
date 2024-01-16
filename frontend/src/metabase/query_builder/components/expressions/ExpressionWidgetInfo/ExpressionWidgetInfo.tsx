import { t } from "ttag";
import Tooltip from "metabase/core/components/Tooltip";
import { useSelector } from "metabase/lib/redux";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Box } from "metabase/ui";
import { InfoLink, StyledFieldTitleIcon } from "../ExpressionWidget.styled";
import { EXPRESSIONS_DOCUMENTATION_URL } from "../ExpressionWidget";

export function ExpressionWidgetInfo() {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  return showMetabaseLinks ? (
    <Tooltip
      tooltip={t`You can reference columns here in functions or equations, like: floor([Price] - [Discount]). Click for documentation.`}
      placement="right"
      maxWidth={332}
    >
      <InfoLink
        target="_blank"
        href={EXPRESSIONS_DOCUMENTATION_URL}
        aria-label={t`Open expressions documentation`}
      >
        <StyledFieldTitleIcon name="info" />
      </InfoLink>
    </Tooltip>
  ) : (
    <Tooltip
      tooltip={t`You can reference columns here in functions or equations, like: floor([Price] - [Discount]).`}
      placement="right"
      maxWidth={332}
    >
      <Box ml="0.25rem">
        <StyledFieldTitleIcon name="info" />
      </Box>
    </Tooltip>
  );
}
