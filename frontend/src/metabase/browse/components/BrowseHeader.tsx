import { t } from "ttag";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";

import Link from "metabase/core/components/Link";
import { Icon } from "metabase/ui";
import {
  BrowseHeaderContent,
  BrowseHeaderRoot,
  BrowserHeaderIconContainer,
} from "./BrowseHeader.styled";

type Crumb = { to?: string; title?: string };

export const BrowseHeader = ({ crumbs = [] }: { crumbs: Crumb[] }) => {
  return (
    <BrowseHeaderRoot>
      <BrowseHeaderContent>
        <BrowserCrumbs crumbs={crumbs} />
        <div className="flex flex-align-right">
          <Link className="flex flex-align-right" to="reference">
            <BrowserHeaderIconContainer>
              <Icon className="flex align-center" size={14} name="reference" />
              <span className="ml1 flex align-center text-bold">
                {t`Learn about our data`}
              </span>
            </BrowserHeaderIconContainer>
          </Link>
        </div>
      </BrowseHeaderContent>
    </BrowseHeaderRoot>
  );
};
