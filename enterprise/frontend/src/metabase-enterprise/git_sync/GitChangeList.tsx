import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { Table } from "metabase/common/components/Table";
import { Button } from "metabase/ui";

export const GitChangeList = () => {
  return (
    <SettingsPageWrapper title="Git changes">
      <SettingsSection title="Pending changes">
        <Table
          rows={[
            { id: 1, change: "Added new dashboard", author: "Alice" },
            { id: 2, change: "Updated metric definition", author: "Bob" },
            { id: 3, change: "Removed segment", author: "Charlie" },
          ]}
          columns={[
            { key: "author", name: "Author" },
            { key: "change", name: "Change" },
            { key: "actions", name: "" },
          ]}
          rowRenderer={(row) => (
            <tr>
              <td style={{ padding: "8px 16px" }}>{row.author}</td>
              <td style={{ padding: "8px 16px" }}>{row.change}</td>
              <td style={{ padding: "8px 16px" }}>
                <Button variant="filled" color="danger" size="compact-sm">
                  {t`Reject`}
                </Button>
              </td>
            </tr>
          )}
        />
      </SettingsSection>
    </SettingsPageWrapper>
  );
};
