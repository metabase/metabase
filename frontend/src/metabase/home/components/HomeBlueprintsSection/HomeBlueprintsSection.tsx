import { t } from "ttag";

import type Database from "metabase-lib/v1/metadata/Database";

import { HomeBlueprintCard } from "../HomeBlueprintCard";
import { HomeCaption } from "../HomeCaption";
import { DatabaseInfo } from "../HomeXraySection";

import { SectionBody } from "./HomeBlueprintsSection.styled";

interface HomeBlueprintsSectionProps {
  databases: Database[];
}

export const HomeBlueprintsSection = ({
  databases,
}: HomeBlueprintsSectionProps) => {
  // Hardcode first database
  const databaseToShow = databases.find(
    (database) => database.blueprints != null && database.blueprints.length > 0,
  )!;

  return (
    <div>
      <HomeCaption>
        {t`We found data this data in your`}{" "}
        <DatabaseInfo database={databaseToShow} />
      </HomeCaption>
      <SectionBody>
        <HomeBlueprintCard title="Salesforce" name="salesforce" url={"#"} />
        <HomeBlueprintCard title="Stripe" name="stripe" url={"#"} />
      </SectionBody>
    </div>
  );
};
