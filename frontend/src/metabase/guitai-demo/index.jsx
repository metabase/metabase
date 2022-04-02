import React from 'react';

const MAX_LEVEL = 3;

class GuiTaiDemo extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      mode: '', // '', 'lefttop', 'righttop'
      level: 0,
    }
  }

  handleLeftTop = () => {
    console.log('handle lefttop')
    this.setState({ mode: this.state.mode === 'lefttop' ? '' : 'lefttop' })
  }

  handleBack = () => {
    console.log('handle back')
    if (this.state.level === 0) {
      return
    }

    this.setState({
      mode: '',
      level: this.state.level - 1,
    })
  }

  handleNextLevel = () => {
    console.log('handle next')
    if (this.state.mode !== '' || this.state.level === MAX_LEVEL) {
      return
    }

    this.setState({ level: this.state.level + 1 })
  }

  handleRightTop = () => {
    console.log('handle righttop')
    this.setState({ mode: this.state.mode === 'righttop' ? '' : 'righttop' })
  }

  getImgSrc = () => {
    const { mode, level } = this.state;

    if (mode === '') {
      return `app/assets/img/map-${level}.png`
    }

    return `app/assets/img/map-${mode}.png`
  }

  render() {
    return (
      <div
        style={{
          // height: '1015px',
          marginTop: '-50px',
          position: 'relative',
        }}
      >
        <img
          // src='app/assets/img/map-0.png'
          src={this.getImgSrc()}
          style={{
            width: '100%',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: '56px',
            left: '0px',
            width: '500px',
            height: '65px',
            cursor: 'pointer',
          }}
          onClick={this.handleLeftTop}
        >
        </div>

        <div
          style={{
            position: 'absolute',
            top: '150px',
            left: '0px',
            width: '800px',
            height: '65px',
            cursor: 'pointer',
          }}
          onClick={this.handleBack}
        >
        </div>

        <div
          style={{
            position: 'absolute',
            top: '210px',
            left: '600px',
            width: '700px',
            height: '700px',
            'border-radius': '50%',
            cursor: 'pointer',
          }}
          onClick={this.handleNextLevel}
        >
        </div>

        <div
          style={{
            position: 'absolute',
            top: '56px',
            right: '0px',
            width: '400px',
            height: '65px',
            cursor: 'pointer',
          }}
          onClick={this.handleRightTop}
        >
        </div>
      </div>
    )
  }
}

export default GuiTaiDemo;
