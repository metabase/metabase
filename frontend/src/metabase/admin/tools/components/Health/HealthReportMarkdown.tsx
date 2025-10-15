import styled from "@emotion/styled";
import Markdown, { MarkdownProps } from "metabase/common/components/Markdown";

export const HealthReportMarkdown = styled(Markdown)<MarkdownProps>`
  h1 {
    margin: 1.5rem 0;
    text-align: center;
  }
  h2 {
    margin: 1rem 0;
  }
  h3 {
    margin: 0.5rem 0;
  }
  h4 {
    margin: 0.5rem 0;
  }
  h5 {
    margin: 0.5rem 0;
  }
  h6 {
    margin: 0.5rem 0;
  }
  table {
    width: 80%;
    border-collapse: collapse;
    margin: 1rem 10% 0 10%;

    th,
    td {
      padding: 0.2rem;
    }

    th {
      font-weight: bold;
    }
  }
`;
