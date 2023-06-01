import { t } from "ttag";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import PopularItems, {
  getIcon,
  getName,
} from "metabase/entities/popular-items";
import { PopularItem } from "metabase-types/api";
import HomeCaption from "../HomeCaption";
import HomeHelpCard from "../HomeHelpCard";
import HomeModelCard from "../HomeModelCard";
import { SectionBody } from "./HomePopularSection.styled";

export interface HomePopularSectionProps {
  popularItems: PopularItem[];
}

const HomePopularSection = ({
  popularItems,
}: HomePopularSectionProps): JSX.Element => {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PopularItems.loadList()(HomePopularSection);
