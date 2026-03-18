import { useState } from "react";
import { t } from "ttag";

import { Stack, Tabs, Textarea } from "metabase/ui";

export function MetabotGuidesPage() {
  const [toneGuide, setToneGuide] = useState(
    "Be helpful, concise, and professional. Use plain language. Avoid jargon unless the user uses it first.",
  );
  const [globalMd, setGlobalMd] = useState(
    "# Metabot Instructions\n\nYou are a helpful data analyst assistant. When answering questions:\n- Always explain your reasoning\n- Cite specific tables and columns\n- Suggest follow-up questions when appropriate",
  );
  const [perUserMd, setPerUserMd] = useState("");

  return (
    <Stack gap="xl" style={{ margin: 32 }}>
      <Tabs defaultValue="tone">
        <Tabs.List>
          <Tabs.Tab value="tone">{t`Tone guide`}</Tabs.Tab>
          <Tabs.Tab value="metabot-md">{t`Metabot.md`}</Tabs.Tab>
          <Tabs.Tab value="per-user">{t`Per-user instructions`}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="tone">
          <Stack gap="lg" mt="xl">
            <Textarea
              value={toneGuide}
              onChange={(e) => setToneGuide(e.target.value)}
              minRows={12}
              maxRows={12}
              size="sm"
              styles={{
                input: {
                  fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                  fontSize: "0.8125rem",
                },
              }}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="metabot-md">
          <Stack gap="lg" mt="xl">
            <Textarea
              value={globalMd}
              onChange={(e) => setGlobalMd(e.target.value)}
              minRows={12}
              maxRows={12}
              size="sm"
              styles={{
                input: {
                  fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                  fontSize: "0.8125rem",
                },
              }}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="per-user">
          <Stack gap="lg" mt="xl">
            <Textarea
              placeholder={t`e.g., Focus on {user_group} metrics and KPIs when answering questions.`}
              value={perUserMd}
              onChange={(e) => setPerUserMd(e.target.value)}
              minRows={12}
              maxRows={12}
              size="sm"
              styles={{
                input: {
                  fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                  fontSize: "0.8125rem",
                },
              }}
            />
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
