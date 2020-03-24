import {IShape} from '@process-engine/bpmn-elements_contracts';

import {ISection} from '../../../../../../../contracts';

export class XORGatewaySection implements ISection {
  public path: string = '/sections/xor-gateway/xor-gateway';
  public canHandleElement: boolean = false;

  public activate(): void {}

  public isSuitableForElement(element: IShape): boolean {
    if (!element) {
      return false;
    }

    return element.type === 'bpmn:ExclusiveGateway';
  }
}
