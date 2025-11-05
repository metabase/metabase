import {
  type AfterViewInit,
  Directive,
  ElementRef,
  Inject,
  Input,
  NgZone,
  type OnChanges,
  type OnDestroy,
  type SimpleChanges,
} from "@angular/core";
import type { ReactElement } from "react";
import { type Root, createRoot } from "react-dom/client";

@Directive({
  selector: "[reactMount]",
  standalone: true,
})
export class ReactMountDirective
  implements AfterViewInit, OnChanges, OnDestroy
{
  @Input("reactMount") reactFactory!: () => ReactElement;

  private root: Root | null = null;

  constructor(
    @Inject(ElementRef) private hostRef: ElementRef<HTMLElement>,
    @Inject(NgZone) private ngZone: NgZone,
  ) {}

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      this.root = createRoot(this.hostRef.nativeElement);
      this.root.render(this.reactFactory());
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.root && "reactFactory" in changes) {
      this.ngZone.runOutsideAngular(() => {
        this.root!.render(this.reactFactory());
      });
    }
  }

  ngOnDestroy() {
    if (this.root) {
      this.ngZone.runOutsideAngular(() => {
        this.root!.unmount();
      });
    }
  }
}
