import { Routes, Route } from "react-router-dom";

import "./App.css";
import Nav from "./Nav";
import Embed from "./Embed";
import styled from "@emotion/styled";

export default function App() {
  return (
    <AppRoot>
      <Nav />
      <Content>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/embed" element={<Embed />} />
        </Routes>
      </Content>
    </AppRoot>
  );
}

const AppRoot = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const Content = styled.div`
  flex: 1;
`;

function Home() {
  return "home";
}
