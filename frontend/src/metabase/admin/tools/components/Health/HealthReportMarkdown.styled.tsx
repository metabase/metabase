import styled from "@emotion/styled";
import Markdown, { MarkdownProps } from "metabase/common/components/Markdown";

export const HealthReportMarkdownStyled = styled(Markdown)<MarkdownProps>`
  padding: 0 2rem 0;

  h1 {
    margin: 1.5rem 0;
    text-align: center;
  }

  h2 {
    margin: 1rem 0;
  }

  h3,
  h4,
  h5,
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

  ul {
    list-style-type: disc;
    margin: 0 1rem 0;
  }

  ol {
    list-style-type: decimal;
    margin: 0 1rem 0;
  }

  p {
    margin: 0.25rem 0;
  }
`;
