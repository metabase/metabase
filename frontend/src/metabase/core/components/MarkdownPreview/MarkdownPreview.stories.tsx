import styled from "@emotion/styled";
import type { ComponentStory } from "@storybook/react";

import { MarkdownPreview } from "./MarkdownPreview";

export default {
  title: "Core/MarkdownPreview",
  component: MarkdownPreview,
};

const Template: ComponentStory<typeof MarkdownPreview> = args => {
  return (
    <Container>
      <MarkdownPreview {...args} />
    </Container>
  );
};

const Container = styled.div`
  width: 200px;
`;

export const PlainText = Template.bind({});
PlainText.args = {
  children: `Our first email blast to the mailing list not directly linked to the release of a new version. We wanted to see if this would effect visits to landing pages for the features in 0.41.`,
};

export const Markdown = Template.bind({});
Markdown.args = {
  children: `![Metabase logo](https://www.metabase.com/images/logo.svg)

# New version

Our first email blast to the mailing list not directly linked to the release
of a new version. We wanted to see if this would effect visits to landing pages
for the features in 0.41.

----

Here’s a [doc](https://metabase.test) with the findings.`,
};
