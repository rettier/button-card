import { directive, PropertyPart } from 'lit-html';
// import '@material/mwc-ripple';
// tslint:disable-next-line
import { myFireEvent } from './my-fire-event';
import { deepEqual } from './deep-equal';

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;

interface ActionHandler extends HTMLElement {
  holdTime: number;
  bind(element: Element, options): void;
}

export interface ActionHandlerDetail {
  action: 'hold' | 'tap' | 'double_tap';
}

export interface ActionHandlerOptions {
  hasHold?: boolean;
  hasDoubleClick?: boolean;
  disabled?: boolean;
  repeat?: number;
}

interface ActionHandlerElement extends HTMLElement {
  actionHandler?: {
    options: ActionHandlerOptions;
    start?: (ev: Event) => void;
    end?: (ev: Event) => void;
    handleEnter?: (ev: KeyboardEvent) => void;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'action-handler': ActionHandler;
  }
  interface HASSDomEvents {
    action: ActionHandlerDetail;
  }
}

class ActionHandler extends HTMLElement implements ActionHandler {
  public holdTime = 300;

  protected timer?: number;

  protected held = false;

  private cancelled = false;

  private dblClickTimeout?: number;

  private repeatTimeout: NodeJS.Timeout | undefined;

  private isRepeating = false;

  private startX;
  private startY;

  constructor() {
    super();
  }

  public connectedCallback(): void {
    Object.assign(this.style, {
      position: 'absolute',
      width: isTouch ? '100px' : '50px',
      height: isTouch ? '100px' : '50px',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      zIndex: '999',
    });

    document.addEventListener(
        "touchmove",
        (ev: Event) => {
          let x;
          let y;
          if ((ev as TouchEvent).touches) {
            x = (ev as TouchEvent).touches[0].pageX;
            y = (ev as TouchEvent).touches[0].pageY;
          } else {
            x = (ev as MouseEvent).pageX;
            y = (ev as MouseEvent).pageY;
          }

          let dX = this.startX - x, dY = this.startY - y;
          let dist = Math.sqrt(dX * dX + dY * dY);
          if( dist < 30 ){
            return;
          }

          this.cancelled = true;
          if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
            if (this.isRepeating && this.repeatTimeout) {
              clearInterval(this.repeatTimeout);
              this.isRepeating = false;
            }
          }
        },
        { passive: true },
    );

    ['touchcancel', 'mouseout', 'mouseup', 'mousewheel', 'wheel', 'scroll'].forEach((ev) => {
      document.addEventListener(
        ev,
        () => {
          this.cancelled = true;
          if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
            if (this.isRepeating && this.repeatTimeout) {
              clearInterval(this.repeatTimeout);
              this.isRepeating = false;
            }
          }
        },
        { passive: true },
      );
    });
  }

  public bind(element: ActionHandlerElement, options: ActionHandlerOptions): void {
    if (element.actionHandler && deepEqual(options, element.actionHandler.options)) {
      return;
    }

    if (element.actionHandler) {
      element.removeEventListener('touchstart', element.actionHandler.start!);
      element.removeEventListener('touchend', element.actionHandler.end!);
      element.removeEventListener('touchcancel', element.actionHandler.end!);

      element.removeEventListener('mousedown', element.actionHandler.start!);
      element.removeEventListener('click', element.actionHandler.end!);

      element.removeEventListener('keyup', element.actionHandler.handleEnter!);
    } else {
      element.addEventListener('contextmenu', (ev: Event) => {
        const e = ev || window.event;
        if (e.preventDefault) {
          e.preventDefault();
        }
        if (e.stopPropagation) {
          e.stopPropagation();
        }
        e.cancelBubble = true;
        e.returnValue = false;
        return false;
      });
    }

    element.actionHandler = { options };

    if (options.disabled) {
      return;
    }

    element.actionHandler.start = (ev: Event) => {
      this.cancelled = false;
      let x;
      let y;
      if ((ev as TouchEvent).touches) {
        x = (ev as TouchEvent).touches[0].pageX;
        y = (ev as TouchEvent).touches[0].pageY;
      } else {
        x = (ev as MouseEvent).pageX;
        y = (ev as MouseEvent).pageY;
      }
      this.startX = x;
      this.startY = y;

      if (options.hasHold) {
        this.held = false;
        this.timer = window.setTimeout(() => {
          this.held = true;
          if (options.repeat && !this.isRepeating) {
            this.isRepeating = true;
            this.repeatTimeout = setInterval(() => {
              myFireEvent(element, 'action', { action: 'hold' });
            }, options.repeat);
          }
        }, this.holdTime);
      }
    };

    element.actionHandler.end = (ev: Event) => {
      // Don't respond when moved or scrolled while touch
      if (['touchend', 'touchcancel'].includes(ev.type) && this.cancelled) {
        if (this.isRepeating && this.repeatTimeout) {
          clearInterval(this.repeatTimeout);
          this.isRepeating = false;
        }
        return;
      }
      const target = ev.target as HTMLElement;
      // Prevent mouse event if touch event
      if (ev.cancelable) {
        ev.preventDefault();
      }
      if (options.hasHold) {
        clearTimeout(this.timer);
        if (this.isRepeating && this.repeatTimeout) {
          clearInterval(this.repeatTimeout);
        }
        this.isRepeating = false;
        this.timer = undefined;
      }
      if (options.hasHold && this.held) {
        if (!options.repeat) {
          myFireEvent(target, 'action', { action: 'hold' });
        }
      } else if (options.hasDoubleClick) {
        if ((ev.type === 'click' && (ev as MouseEvent).detail < 2) || !this.dblClickTimeout) {
          this.dblClickTimeout = window.setTimeout(() => {
            this.dblClickTimeout = undefined;
            myFireEvent(target, 'action', { action: 'tap' });
          }, 250);
        } else {
          clearTimeout(this.dblClickTimeout);
          this.dblClickTimeout = undefined;
          myFireEvent(target, 'action', { action: 'double_tap' });
        }
      } else {
        myFireEvent(target, 'action', { action: 'tap' });
      }
    };

    element.actionHandler.handleEnter = (ev: KeyboardEvent) => {
      if (ev.keyCode !== 13) {
        return;
      }
      (ev.currentTarget as ActionHandlerElement).actionHandler!.end!(ev);
    };

    element.addEventListener('touchstart', element.actionHandler.start, {
      passive: true,
    });
    element.addEventListener('touchend', element.actionHandler.end);
    element.addEventListener('touchcancel', element.actionHandler.end);

    element.addEventListener('mousedown', element.actionHandler.start, {
      passive: true,
    });
    element.addEventListener('click', element.actionHandler.end);

    element.addEventListener('keyup', element.actionHandler.handleEnter);
  }
}

customElements.define('button-card-action-handler', ActionHandler);

const getActionHandler = (): ActionHandler => {
  const body = document.body;
  if (body.querySelector('button-card-action-handler')) {
    return body.querySelector('button-card-action-handler') as ActionHandler;
  }

  const actionhandler = document.createElement('button-card-action-handler');
  body.appendChild(actionhandler);

  return actionhandler as ActionHandler;
};

export const actionHandlerBind = (element: ActionHandlerElement, options: ActionHandlerOptions): void => {
  const actionhandler: ActionHandler = getActionHandler();
  if (!actionhandler) {
    return;
  }
  actionhandler.bind(element, options);
};

export const actionHandler = directive((options: ActionHandlerOptions = {}) => (part: PropertyPart): void => {
  actionHandlerBind(part.committer.element as ActionHandlerElement, options);
});
