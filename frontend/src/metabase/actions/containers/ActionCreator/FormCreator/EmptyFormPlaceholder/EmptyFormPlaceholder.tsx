import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Icon } from "metabase/ui";

import {
  EmptyFormPlaceholderWrapper,
  ExplainerTitle,
  ExplainerText,
  ExplainerList,
  ExplainerLink,
  IconContainer,
  TopRightIcon,
} from "./EmptyFormPlaceholder.styled";

export const EmptyFormPlaceholder = () => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  return (
    <EmptyFormPlaceholderWrapper>
      <IconContainer>
        <Icon name="sql" size={62} />
        <TopRightIcon name="insight" size={24} />
      </IconContainer>
      <ExplainerTitle>{t`Build custom forms and business logic.`}</ExplainerTitle>
      <ExplainerText>
        {t`Actions let you write parameterized SQL that writes back to your database. Actions can be attached to buttons on dashboards to create custom workflows. You can even publicly share the parameterized forms they generate to collect data.`}
      </ExplainerText>
      <ExplainerText>
        {t`Here are a few ideas for what you can do with actions`}
        <ExplainerList>
          <li>{t`Create a customer feedback form and embed it on your website.`}</li>
          <li>{t`Mark the customer you’re viewing in a dashboard as a VIP.`}</li>
          <li>{t`Let team members remove redundant data.`}</li>
        </ExplainerList>
      </ExplainerText>
      {showMetabaseLinks && (
        <ExplainerLink
          href={MetabaseSettings.docsUrl("actions/custom")}
        >{t`See an example`}</ExplainerLink>
      )}
    </EmptyFormPlaceholderWrapper>
  );
};
