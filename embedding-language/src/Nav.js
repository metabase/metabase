import styled from "@emotion/styled";
import { Link } from "react-router-dom";

export default function Nav() {
  return (
    <NavRoot>
      <ul>
        <li>
          <Link to="/">Home</Link>
        </li>
        <li>
          <Link to="/embed">Embed</Link>
        </li>
      </ul>
    </NavRoot>
  );
}

const NavRoot = styled.nav`
  background-color: black;
  color: white;

  ul {
    margin: 0;
    display: flex;
    list-style: none;

    li {
      padding: 1em;

      a,
      a:visited {
        color: inherit;
        text-decoration-line: none;
      }
    }
  }
`;
