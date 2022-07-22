import React from "react";
import { t } from "ttag";

import {
  Grid,
  Info,
  Title,
  TextArea,
  Description,
  Spacer,
} from "./ResponseTab.styled";

type Props = {
  responseHandler: string;
  onResponseHandlerChange: (responseHandler: string) => void;

  errorHandler: string;
  onErrorHandlerChange: (errorHandler: string) => void;
};

const ResponseTab: React.FC<Props> = ({
  responseHandler,
  onResponseHandlerChange,
  errorHandler,
  onErrorHandlerChange,
}: Props) => {
  return (
    <Grid>
      <Info>
        <Title>{t`Response Handler`}</Title>
        <Description>{t`Specify a JSON path for the response data`}</Description>
      </Info>
      <TextArea
        value={responseHandler}
        onChange={event => onResponseHandlerChange(event.target.value)}
        placeholder={".body.result"}
      />
      <Spacer />
      <Info>
        <Title>{t`Error Handler`}</Title>
        <Description>{t`Specify a JSON path for the error message`}</Description>
      </Info>
      <TextArea
        value={errorHandler}
        onChange={event => onErrorHandlerChange(event.target.value)}
        placeholder={".body.error.message"}
      />
    </Grid>
  );
};

export default ResponseTab;
