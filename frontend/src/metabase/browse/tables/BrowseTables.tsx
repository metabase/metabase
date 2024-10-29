import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
} from "../components/BrowseContainer.styled";
import { BrowseDataHeader } from "../components/BrowseDataHeader";
import TableBrowser from "../containers/TableBrowser";

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
