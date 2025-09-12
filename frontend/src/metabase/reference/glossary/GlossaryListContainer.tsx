import cx from "classnames";

import SidebarLayout from "metabase/common/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import BaseSidebar from "metabase/reference/guide/BaseSidebar";

import { Glossary } from "./Glossary";

export function GlossaryListContainer() {
  return (
    <SidebarLayout
      className={cx(CS.flexFull, CS.relative)}
      sidebar={<BaseSidebar />}
    >
      <Glossary />
    </SidebarLayout>
  );
}
