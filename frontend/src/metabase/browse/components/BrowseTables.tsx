import TableBrowser from "../containers/TableBrowser";

import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
} from "./BrowseContainer.styled";
import { BrowseDataHeader } from "./BrowseDataHeader";

export const BrowseTables = ({
  params: { dbId, schemaName },
}: {
  params: {
    dbId: string;
    schemaName: string;
  };
}) => {
  return (
    <BrowseContainer>
      <BrowseDataHeader />
      <BrowseMain>
        <BrowseSection direction="column">
          <TableBrowser dbId={dbId} schemaName={schemaName} />
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};
