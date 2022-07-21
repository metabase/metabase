import React from "react";
import { t } from "ttag";
import { assoc } from "icepick";

import {
  Input,
  Grid,
  LeftHeader,
  RightHeader,
  HeaderRow,
  DeleteButton,
  AddButton,
  Title,
  TitleRowContainer,
} from "./HttpHeaderTab.styled";

export type Headers = {
  key: string;
  value: string;
}[];

type Props = {
  headers: Headers;
  setHeaders: (contentType: Headers) => void;
};

const HttpHeaderTab: React.FC<Props> = ({ headers, setHeaders }: Props) => {
  const add = () => {
    setHeaders([...headers, { key: "", value: "" }]);
  };
  return (
    <Grid>
      <LeftHeader>
        <Title>{t`Name`}</Title>
      </LeftHeader>
      <RightHeader>
        <Title>{t`Value`}</Title>
        <AddButton primary icon="add" onlyIcon onClick={add} />
      </RightHeader>
      {headers.map(({ key, value }, index) => {
        const setKey = (key: string) =>
          setHeaders(assoc(headers, index, { key, value }));
        const setValue = (value: string) =>
          setHeaders(assoc(headers, index, { key, value }));
        const remove = () =>
          setHeaders(assoc(headers, index, false).filter(Boolean));
        return (
          <>
            <LeftHeader>
              <Header
                placeholder={t`Header Name`}
                value={key}
                setValue={setKey}
              />
            </LeftHeader>
            <RightHeader>
              <Header
                placeholder={t`Value`}
                value={value}
                setValue={setValue}
              />
              <DeleteButton icon="trash" onlyIcon onClick={remove} />
            </RightHeader>
          </>
        );
      })}
    </Grid>
  );
};

type InputProps = {
  value: string;
  placeholder: string;
  setValue: (value: string) => void;
};

const Header: React.FC<InputProps> = ({
  value,
  setValue,
  placeholder,
}: InputProps) => {
  return (
    <Input
      placeholder={placeholder}
      value={value}
      onChange={e => setValue(e.target.value)}
    />
  );
};

export default HttpHeaderTab;
