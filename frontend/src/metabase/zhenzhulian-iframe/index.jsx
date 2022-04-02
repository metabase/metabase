import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  height: calc(100vh - 90px);
`

class ZhenZhuLianIFrame extends React.Component {
  render() {
    return (
      <Container>
        <iframe
          src='/chain'
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </Container>
    )
  }
}

export default ZhenZhuLianIFrame;

