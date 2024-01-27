import { t } from "ttag";
import Link from "metabase/core/components/Link";
import { Icon } from "metabase/ui";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";
import {
  BrowseHeaderContent,
  BrowseHeaderIconContainer,
} from "./BrowseHeader.styled";

type Crumb = { to?: string; title?: string };

export const BrowseHeader = ({ crumbs = [] }: { crumbs: Crumb[] }) => {
  return (
    <BrowseHeaderContent>
      <BrowserCrumbs crumbs={crumbs} />
      <div className="flex flex-align-right">
        <Link className="flex flex-align-right" to="reference">
          <BrowseHeaderIconContainer>
            <Icon className="flex align-center" size={14} name="reference" />
            <span className="ml1 flex align-center text-bold">
              {t`Learn about our data`}
            </span>
          </BrowseHeaderIconContainer>
        </Link>
      </div>
    </BrowseHeaderContent>
  );
};
