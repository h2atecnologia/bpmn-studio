import {IModdleElement} from './IModdleElement';

export interface IShape {
  businessObject: IModdleElement;
  id: string;
  type: string;
  label: IShape;
  x: number;
  y: number;
  width: number;
  height: number;
}