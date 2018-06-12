import { Box } from 'grid-styled'
import { normal } from "metabase/lib/colors";

function bgForCard (props) {
  if(props.dark) {
    return '#2E353B'
  }
  if(props.faded) {
    return '#FAFAFC'
  }
  return 'white'
}

function borderForCard (props) {
  if(props.dark) {
    return 'transparent'
  }
  if(props.faded) {
    return '#EDF0F1'
  }
  return '#f5f6f7'
}

function shadowForCard (props) {
  if(props.dark) {
    return '#65686b'
  }
  if(props.faded) {
    return 'transparent'
  }
  return normal.grey1

}

const Card = Box.extend`
  background-color: ${bgForCard};
  border: 1px solid ${borderForCard};
  ${props => props.dark && `color: white`};
  border-radius: 6px;
  box-shadow: 0 1px 3px ${shadowForCard};
  ${props =>
    props.hoverable &&
    `&:hover {
    box-shadow: 0 2px 3px ${props.dark ? "#2e35b" : "#DCE1E4"};
  }`};
`;

Card.displayName = 'Card'

export default Card;
