import styled from "@emotion/styled";

export default function Embed() {
  return (
    <EmbedRoot>
      <Frame src="http://localhost:3000?locale=de-DE" />
    </EmbedRoot>
  );
}

const EmbedRoot = styled.div`
  line-height: 0;
  height: 100%;
`;

const Frame = styled.iframe`
  width: 100%;
  height: 100%;
  border: none;
`;
