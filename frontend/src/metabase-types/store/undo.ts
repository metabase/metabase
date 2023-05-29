
export type Undo = {
  id: number,  
  message: string,
  toastColor?: string,
  action: any
  actions: [],
  actionLabel?: string
  icon?: string,
  verb?: string,
  undo?: boolean,
  subject?: string,
  _domId?: number
  timeout: number
  count: number
}

export type UndoState = Undo[];