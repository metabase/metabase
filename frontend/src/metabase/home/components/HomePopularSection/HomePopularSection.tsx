import { t } from "ttag";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import { getIcon, getName } from "metabase/entities/popular-items";
import { usePopularItemListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import type { PopularItem } from "metabase-types/api";
import { HomeCaption } from "../HomeCaption";
import { HomeHelpCard } from "../HomeHelpCard";
import { HomeModelCard } from "../HomeModelCard";
import { SectionBody } from "./HomePopularSection.styled";

export const HomePopularSection = (): JSX.Element => {
  const {
    data: popularItems = [],
    isLoading,
    error,
  } = usePopularItemListQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      <HomeCaption>{getTitle(popularItems)}</HomeCaption>
      <SectionBody>
        {popularItems.map((item, index) => (
          <HomeModelCard
            key={index}
            title={getName(item)}
            icon={getIcon(item)}
            url={Urls.modelToUrl(item) ?? ""}
          />
        ))}
        <HomeHelpCard />
      </SectionBody>
    </div>
  );
};

const getTitle = (popularItems: PopularItem[]) => {
  const models = _.uniq(popularItems.map(item => item.model));

  if (models.length !== 1) {
    return t`Here are some popular items`;
  }

  switch (models[0]) {
    case "table":
      return t`Here are some popular tables`;
    case "card":
      return t`Here are some popular questions`;
    case "dataset":
      return t`Here are some popular models`;
    case "dashboard":
      return t`Here are some popular dashboards`;
    default:
      return t`Here are some popular items`;
  }
};
