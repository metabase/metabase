import { createReducer, createAction, createAsyncThunk } from "@reduxjs/toolkit";

const OPEN_MODAL = "metabase/debug/OPEN_MODAL"
export const openModal = createAction(OPEN_MODAL)

const CLOSE_MODAL = "metabase/debug/CLOSE_MODAL";
export const closeModal = createAction(CLOSE_MODAL);

const TAKE_SCREENSHOT = "metabase/debug/TAKE_SCREENSHOT"
export const takeScreenshot = createAsyncThunk(TAKE_SCREENSHOT, async (_, {dispatch}) => {

  const canvas = document.createElement("canvas");
  canvas.height = window.innerHeight;
  canvas.width = window.innerWidth
  const context = canvas.getContext("2d");
  const screenshot = document.createElement("video");

  screenshot.height = window.innerHeight;
  screenshot.width = window.innerWidth

  // document.appendChild(screenshot)

  try {
      const captureStream = await navigator.mediaDevices.getDisplayMedia({preferCurrentTab: true});
      screenshot.srcObject = captureStream;
      await screenshot.play();
      context.drawImage(screenshot, 0, 0, window.innerWidth, window.innerHeight);
      
      const frame = canvas.toDataURL("image/png");
      captureStream.getTracks().forEach(track => track.stop());
      // window.location.href = frame;
      console.log(frame)
      dispatch(openModal({screenshotUrl: frame}))
    
     

  } catch (err) {
      console.error("Error: " + err);
  }

});

const initialState = {
  screenshot: null,
  modalOpen: false
}


export const debugReducer = createReducer(initialState, builder => {
  builder.addCase(openModal, (state, {payload}) => {
    console.log(payload)
    state.screenshot = payload.screenshotUrl;
    state.modalOpen = true;
  })

  builder.addCase(closeModal, (state) => {
    state.screenshot = null;
    state.modalOpen = false;
  })
})