;;; -*- tab-width: 2; -*-



;;; iNES Header

  .inesprg 1                    ; 1x 16KB PRG code
  .ineschr 1                    ; 1x  8KB CHR data
  .inesmap 0                    ; mapper 0 = NROM, no bank swapping
  .inesmir 1                    ; background mirroring

;;; MACROS / DEFINES

Funcall1 .macro
  LDA \2
  STA arg1
  JSR \1
  .endm

Funcall2 .macro
  LDA \3
  STA arg2
  Funcall1 \1, \2
  .endm

Funcall3 .macro
  LDA \4
  STA arg3
  Funcall2 \1, \2, \3
  .endm

Funcall4 .macro
  LDA \5
  STA arg4
  Funcall3 \1, \2, \3, \4
  .endm

CONTROLLER_A      = %10000000
CONTROLLER_B      = %01000000
CONTROLLER_SELECT = %00100000
CONTROLLER_START  = %00010000
CONTROLLER_UP     = %00001000
CONTROLLER_DOWN   = %00000100
CONTROLLER_LEFT   = %00000010
CONTROLLER_RIGHT  = %00000001


;;; VARIABLES

  .rsset $0000
arg1 .rs 1                      ; reserve 4 bytes in RAM for subroutine args
arg2 .rs 1
arg3 .rs 1
arg4 .rs 1

m .rs 1                         ; reserve 4 more bytes for temporary local vars
n .rs 1
o .rs 1
p .rs 1

controller1 .rs 1               ; a couple more bytes to represent the current controller input
controller2 .rs 1

;;; CODE

  .bank 0
  .org $C000

VBlankWait:
  BIT $2002
  BPL VBlankWait
  RTS

RESET:
  ;; Initial setup
  SEI                           ; disable IRQs
  CLD                           ; disable decimal mode
  LDX #$40                      ; disable APU frame IRQ
  STX $4017
  LDX #$FF
  TXS                           ; set up stack
  INX                           ; x = 0
  STX $2000                     ; disable NMI
  STX $2001                     ; disable rendering
  STX $4010                     ; disable DMC IRQs

  ;; 1st wait for VBlank to make sure PPU is ready
  JSR VBlankWait

  ;; We have some time before PPU is fully ready, zero out memory in meantime
ClearMemory:
  LDA #$FE                      ; ACC = $FE
  STA $0200, x                  ; $0200[x] = ACC
  LDA #$00                      ; ACC = 0
  STA $0000, x                  ; $0000[x] = ACC
  STA $0100, x                  ; $0100[x] = ACC
  STA $0300, x                  ; ...
  STA $0400, x
  STA $0500, x
  STA $0600, x
  STA $0700, x
  INX                           ; x++
  BNE ClearMemory               ; while x != 0 (256 times; 8 bit registers loop back over to 0)

  ;; PPU is ready after second wait for VBlank
  JSR VBlankWait

  ;; Load the color palettes to be used in the background
LoadPalettes:
  LDA $2002                     ; read PPU status to reset high/low latch
  LDA #$3F
  STA $2006                     ; tell PPU buffer to start writing at $3F00
  LDA #$00
  STA $2006
  LDX #$00
LoadPalettesLoop:
  LDA palette, x                ; ACC = palette[x]
  STA $2007                     ; write ACC to PPU data buffer
  INX                           ; x++
  CPX #$20                      ; x == 32 ?
  BNE LoadPalettesLoop          ; if not, recur

LoadSprites:
  LDX #$00                      ; x = 0
LoadSpritesLoop:
  LDA sprites, x                ; ACC = sprites[x]
  STA $0200, x                  ; $0200[x] = ACC
  INX                           ; x++
  ;; CPX #$10                      ; x == 16 ?
  CPX #$04                      ; x == 4 ?
  BNE LoadSpritesLoop           ; if not, recur

LoadBackground:
  LDA $2002                     ; read PPU status to reset high/low latch
  LDA #$20
  STA $2006                     ; point PPU data buffer at $2000
  LDA #$00
  STA $2006

  ;; use combined mn as pointer to address of background
  LDA #LOW(background)
  STA m                         ; m <-> low byte
  LDA #HIGH(background)
  STA n                         ; n <-> high byte

  LDX #$00                      ; x = 0
  LDY #$00                      ; y = 0
LoadBackgroundOuterLoop:

  ;; each inner loop sets up 256 tiles = 8 rows
LoadBackgroundInnerLoop:
  LDA [m],y                     ; ACC = $mn[y]
  STA $2007                     ; write ACC to PPU data buffer
  INY                           ; y++
  CPY #$00                      ; y == 0 ?
  BNE LoadBackgroundInnerLoop   ; recur while y != 0

  ;; low byte looped back over to 0, so increment the high byte
  INC n                         ; n++

  INX                           ; x++
  CPX #$04                      ; x == 4 ?
  BNE LoadBackgroundOuterLoop   ; recur while x != 4 (run outer loop 4 times for a total of 32 rows)


FinishRESET:
  LDA #%10010000                ; enable NMI, sprites from pattern table 0, bg from pattern table 1
  STA $2000

  LDA #%00011110                ; enable sprites, bg, disable clipping on left side
  STA $2001

Forever:
  JMP Forever                   ; infinite loop



;;; Totally sweet subroutine for reading a controller
;;; ReadController(controllerPort, dest)
;;; After calling, bits in dest = A B SELECT START UP DOWN LEFT RIGHT
ReadController:
  LDX #$08                      ; x = 8
  LDY #$00                      ; y = 0
ReadControllerLoop:
  LDA [arg1], y                 ; ACC = *(arg1[y])
  LDA $4016
  LSR A                         ; shift right bit of acc into carry
  ROL m                         ; rotate bits of arg3 left, pushing carry into rightmost poisition
  DEX                           ; x--
  BNE ReadControllerLoop        ; while (x != 0)

  LDA m
  STA [arg3], y
  RTS

;;; Subnoutine to latch controllers, read both, & store the bits in controller1/2
ReadControllers:
  LDA #$01                      ; strobe the controllers
  STA $4016
  LDA #$00
  STA $4016
  Funcall4 ReadController, #$40, #$16, #LOW(controller1), #HIGH(controller1)
  Funcall4 ReadController, #$40, #$17, #LOW(controller2), #HIGH(controller2)
  RTS


NMI:
  LDA #$00
  STA $2003                     ; set the low byte (00) of the RAM address
  LDA #$02
  STA $4014                     ; set the high byte (02) of the RAM address, start the transfer


  JSR ReadControllers           ; get current button presses

CheckController1Up:
  LDA controller1
  AND #CONTROLLER_UP
  BEQ CheckController1Down
OnController1Up:
  LDY $0200
  DEY
  DEY
  STY $0200

CheckController1Down:
  LDA controller1
  AND #CONTROLLER_DOWN
  BEQ CheckController1Left
OnController1Down:
  LDY $0200
  INY
  INY
  STY $0200

CheckController1Left:
  LDA controller1
  AND #CONTROLLER_LEFT
  BEQ CheckController1Right
OnController1Left:
  LDX $0203
  DEX
  DEX
  STX $0203

CheckController1Right:
  LDA controller1
  AND #CONTROLLER_RIGHT
  BEQ FinishNMI
OnController1Right:
  LDX $0203                     ; x = sprite0.xPosition
  INX                           ; x++
  INX
  STX $0203                     ; sprite0.xPosition = x

FinishNMI:
  ;; PPU Cleanup, so rendering the next frame starts properly
  LDA #%10010000                ; enable NMI, sprites frome pattern table 0, bg from pattern table 1
  STA $2000
  LDA #%00011110                ; enable sprites, enable bg, no clipping on left side
  STA $2001
  LDA #$00                      ; disable background scrolling
  STA $2005
  STA $2005

  RTI                           ; Return From NMI Interrupt


;;; DATA

  .bank 1
  .org $E000

  ;; TODO - these are all the same pallete !
  ;; $30 = bright white
  ;; $31 = light blue
  ;; $11 = dark blue
  ;; $0F = black
palette:
  .db $30,$31,$11,$0F, $30,$31,$11,$0F, $30,$31,$11,$0F, $30,$31,$11,$0F ; background palette
  .db $30,$19,$29,$0F, $30,$19,$29,$0F, $30,$19,$29,$0F, $30,$19,$29,$0F ; sprite palette

  ;; Metabase logo
  ;; TODO - This wastes a lot of memory, if we wrote a couple of subroutines to a draw ball at a given point & render text at a given point we could save some memory
background:
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 0
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 1
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 2
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$4B, $4C,$4E,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 3
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$4D, $25,$52,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 4
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$4F, $51,$50,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 5
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 6
  .db $24,$24,$24,$24,$24,$24,$24,$53, $57,$54,$24,$4B,$4C,$4E,$24,$4B, $4C,$4E,$24,$4B,$4C,$4E,$24,$53, $57,$54,$24,$24,$24,$24,$24,$24 ; row 7
  .db $24,$24,$24,$24,$24,$24,$24,$58, $26,$5A,$24,$4D,$25,$52,$24,$4D, $25,$52,$24,$4D,$25,$52,$24,$58, $26,$5A,$24,$24,$24,$24,$24,$24 ; row 8
  .db $24,$24,$24,$24,$24,$24,$24,$55, $59,$56,$24,$4F,$51,$50,$24,$4F, $51,$50,$24,$4F,$51,$50,$24,$55, $59,$56,$24,$24,$24,$24,$24,$24 ; row 9
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 10
  .db $24,$24,$24,$24,$24,$24,$24,$53, $57,$54,$24,$53,$57,$54,$24,$4B, $4C,$4E,$24,$53,$57,$54,$24,$53, $57,$54,$24,$24,$24,$24,$24,$24 ; row 11
  .db $24,$24,$24,$24,$24,$24,$24,$58, $26,$5A,$24,$58,$26,$5A,$24,$4D, $25,$52,$24,$58,$26,$5A,$24,$58, $26,$5A,$24,$24,$24,$24,$24,$24 ; row 12
  .db $24,$24,$24,$24,$24,$24,$24,$55, $59,$56,$24,$55,$59,$56,$24,$4F, $51,$50,$24,$55,$59,$56,$24,$55, $59,$56,$24,$24,$24,$24,$24,$24 ; row 13
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 14
  .db $24,$24,$24,$24,$24,$24,$24,$53, $57,$54,$24,$4B,$4C,$4E,$24,$53, $57,$54,$24,$4B,$4C,$4E,$24,$53, $57,$54,$24,$24,$24,$24,$24,$24 ; row 15
  .db $24,$24,$24,$24,$24,$24,$24,$58, $26,$5A,$24,$4D,$25,$52,$24,$58, $26,$5A,$24,$4D,$25,$52,$24,$58, $26,$5A,$24,$24,$24,$24,$24,$24 ; row 16
  .db $24,$24,$24,$24,$24,$24,$24,$55, $59,$56,$24,$4F,$51,$50,$24,$55, $59,$56,$24,$4F,$51,$50,$24,$55, $59,$56,$24,$24,$24,$24,$24,$24 ; row 17
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 18
  .db $24,$24,$24,$24,$24,$24,$24,$53, $57,$54,$24,$4B,$4C,$4E,$24,$4B, $4C,$4E,$24,$4B,$4C,$4E,$24,$53, $57,$54,$24,$24,$24,$24,$24,$24 ; row 19
  .db $24,$24,$24,$24,$24,$24,$24,$58, $26,$5A,$24,$4D,$25,$52,$24,$4D, $25,$52,$24,$4D,$25,$52,$24,$58, $26,$5A,$24,$24,$24,$24,$24,$24 ; row 20
  .db $24,$24,$24,$24,$24,$24,$24,$55, $59,$56,$24,$4F,$51,$50,$24,$4F, $51,$50,$24,$4F,$51,$50,$24,$55, $59,$56,$24,$24,$24,$24,$24,$24 ; row 21
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 22
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$4B, $4C,$4E,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 23
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$4D, $25,$52,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 24
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$4F, $51,$50,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 25
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 26
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$16,$0E,$1D,$0A, $0B,$0A,$1C,$0E,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 27
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 28
  .db $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24, $24,$24,$24,$24,$24,$24,$24,$24 ; row 29

sprites:
     ;vert tile attr horiz
  .db $80, $75, $00, $80        ; sprite 0
  ;; .db $80, $75, $00, $88        ; sprite 1 DISABLED FOR NOW!
  ;; .db $88, $75, $00, $80        ; sprite 2
  ;; .db $88, $75, $00, $88        ; sprite 3


;;; INTERRUPT VECTORS
  .org $FFFA
  .dw NMI                       ; NMI (VBlank - once per frame) routine
  .dw RESET                     ; startup / reset routine
  .dw 0                         ; external interrupt IRQ - not used for right now

;;; CHR DATA

  .bank 2
  .org $0000
  .incbin "metabase.chr"
