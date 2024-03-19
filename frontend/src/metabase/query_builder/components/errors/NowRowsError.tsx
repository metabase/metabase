import styled from "@emotion/styled";

import noResultsSource from "assets/img/no_results.svg";

export const NoRowsError = styled.div`
  width: 120px;
  height: 120px;
  background-image: url(${noResultsSource});
  background-repeat: no-repeat;
  margin-bottom: 1rem;
`;
