/*
 * Copyright 2016 Palantir Technologies, Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0 - http://www.apache.org/licenses/LICENSE-2.0
 */

import { expect } from "chai";
import { mount } from "enzyme";
import * as Enzyme from "enzyme";
import * as React from "react";
import * as ReactDOM from "react-dom";

import {
    Hotkey,
    Hotkeys,
    HotkeysTarget,
    IKeyCombo,
    comboMatches,
    getKeyCombo,
    getKeyComboString,
    hideHotkeysDialog,
    parseKeyCombo,
 } from "../../src/index";
import { dispatchTestKeyboardEvent } from "../common/utils";

describe("Hotkeys", () => {
    describe("Local/Global @HotkeysTarget", () => {

        let localHotkeySpy: Sinon.SinonSpy = null;
        let globalHotkeySpy: Sinon.SinonSpy = null;
        let attachTo: HTMLElement = null;
        let comp: Enzyme.ReactWrapper<any, any> = null;

        @HotkeysTarget
        class TestComponent extends React.Component<{}, {}> {
            public renderHotkeys() {
                return <Hotkeys>
                    <Hotkey label="local hotkey" group="test" combo="1" onKeyDown={localHotkeySpy} />
                    <Hotkey label="global hotkey" global combo="2" onKeyDown={globalHotkeySpy} />
                </Hotkeys>;
            }

            public render() {
                return <div><input type="text" /><div>Other stuff</div></div>;
            }
        }

        beforeEach(() => {
            localHotkeySpy = sinon.spy();
            globalHotkeySpy = sinon.spy();

            attachTo = document.createElement("div");
            document.documentElement.appendChild(attachTo);
        });

        afterEach(() => {
            comp.detach();
            attachTo.remove();
        });

        it("triggers local and global hotkey", () => {
            comp = mount(<TestComponent />, { attachTo });
            const node = ReactDOM.findDOMNode(comp.instance());

            dispatchTestKeyboardEvent(node, "keydown", "1");
            expect(localHotkeySpy.called).to.be.true;

            dispatchTestKeyboardEvent(node, "keydown", "2");
            expect(globalHotkeySpy.called).to.be.true;
        });

        it("triggers only global hotkey when not focused", () => {
            comp = mount(<div><TestComponent /><div className="unhotkeyed" tabIndex={2} /></div>, { attachTo });
            const unhotkeyed = ReactDOM.findDOMNode(comp.instance()).querySelector(".unhotkeyed");
            (unhotkeyed as HTMLElement).focus();

            dispatchTestKeyboardEvent(unhotkeyed, "keydown", "1");
            expect(localHotkeySpy.called).to.be.false;

            dispatchTestKeyboardEvent(unhotkeyed, "keydown", "2");
            expect(globalHotkeySpy.called).to.be.true;
        });

        it("ignores hotkeys when inside text input", () => {
            comp = mount(<TestComponent />, { attachTo });
            const input = ReactDOM.findDOMNode(comp.instance()).querySelector("input");
            (input as HTMLElement).focus();

            dispatchTestKeyboardEvent(input, "keydown", "1");
            expect(localHotkeySpy.called).to.be.false;

            dispatchTestKeyboardEvent(input, "keydown", "2");
            expect(globalHotkeySpy.called).to.be.false;
        });

        it("triggers hotkey dialog with \"?\"", (done) => {
            comp = mount(<TestComponent />, { attachTo });
            const node = ReactDOM.findDOMNode(comp.instance());

            dispatchTestKeyboardEvent(node, "keydown", "/", true);

            setTimeout(() => {
                expect(document.querySelector(".pt-hotkey-column")).to.exist;
                hideHotkeysDialog();
                expect(document.querySelector(".pt-hotkey-column")).to.not.exist;
                comp.detach();
                attachTo.remove();
                done();
            }, 100);
        });

        it("can generate hotkey combo string from keyboard input", () => {
            const combo = "shift + x";
            const handleKeyDown = sinon.spy();

            @HotkeysTarget
            class ComboComponent extends React.Component<{}, {}> {
                public renderHotkeys() {
                    return <Hotkeys>
                        <Hotkey label="global hotkey" global combo={combo} onKeyDown={handleKeyDown} />
                    </Hotkeys>;
                }

                public render() {
                    return <div>Some content</div>;
                }
            }

            comp = mount(<ComboComponent />, { attachTo });
            const node = ReactDOM.findDOMNode(comp.instance());

            // We have to use capital X here to make the charCode == keyCode.
            // Implementors won't have to worry about this detail.
            dispatchTestKeyboardEvent(node, "keydown", "X", true);
            expect(handleKeyDown.called).to.be.true;
            const testCombo = getKeyComboString(handleKeyDown.firstCall.args[0]);
            expect(testCombo).to.equal(combo);
        });
    });

    describe("KeyCombo parser", () => {
        interface IComboTest {
            combo: string;
            stringKeyCombo: string;
            eventKeyCombo: IKeyCombo;
            parsedKeyCombo: IKeyCombo;
        }

        const makeComboTest = (combo: string, event: KeyboardEvent) => {
            return {
                combo,
                eventKeyCombo: getKeyCombo(event),
                parsedKeyCombo: parseKeyCombo(combo),
                stringKeyCombo: getKeyComboString(event),
            };
        };

        const verifyCombos = (tests: IComboTest[], verifyStrings = true) => {
            for (const test of tests) {
                if (verifyStrings) {
                    expect(test.stringKeyCombo).to.equal(test.combo);
                }
                expect(comboMatches(test.parsedKeyCombo, test.eventKeyCombo)).to.be.true;
            }
        };

        it("matches lowercase alphabet chars", () => {
            const alpha = 65;
            verifyCombos(Array.apply(null, Array(26)).map((o: any, i: number) => {
                const combo = String.fromCharCode(alpha + i).toLowerCase();
                const event = { which: alpha + i } as KeyboardEvent;
                return makeComboTest(combo, event);
            }));
        });

        it("bare alphabet chars ignore case", () => {
            const alpha = 65;
            verifyCombos(Array.apply(null, Array(26)).map((o: any, i: number) => {
                const combo = String.fromCharCode(alpha + i).toUpperCase();
                const event = { which: alpha + i } as KeyboardEvent;
                return makeComboTest(combo, event);
            }), false); // don't compare string combos
        });

        it("matches uppercase alphabet chars using shift", () => {
            const alpha = 65;
            verifyCombos(Array.apply(null, Array(26)).map((o: any, i: number) => {
                const combo = "shift + " + String.fromCharCode(alpha + i).toLowerCase();
                const event = { shiftKey: true, which: alpha + i } as KeyboardEvent;
                return makeComboTest(combo, event);
            }));
        });

        it("matches modifiers only", () => {
            const tests = [] as IComboTest[];
            const ignored = 16;
            tests.push(makeComboTest(
                "shift",
                { shiftKey: true, which: ignored } as KeyboardEvent,
            ));
            tests.push(makeComboTest(
                "ctrl + alt + shift",
                { altKey: true, ctrlKey: true, shiftKey: true, which: ignored } as KeyboardEvent,
            ));
            tests.push(makeComboTest(
                "ctrl + meta",
                { ctrlKey: true, metaKey: true, which: ignored } as KeyboardEvent,
            ));
            verifyCombos(tests);
        });

        it("adds shift to keys that imply it", () => {
            const tests = [] as IComboTest[];
            tests.push(makeComboTest(
                "!",
                { shiftKey: true, which: 49 } as KeyboardEvent,
            ));
            tests.push(makeComboTest(
                "@",
                { shiftKey: true, which: 50 } as KeyboardEvent,
            ));
            tests.push(makeComboTest(
                "{",
                { shiftKey: true, which: 219 } as KeyboardEvent,
            ));
            // don't verify the strings because these will be converted to
            // `shift + 1`, etc.
            verifyCombos(tests, false);
        });

        it("handles plus", () => {
            expect(() => parseKeyCombo("ctrl + +")).to.throw(/failed to parse/i);

            expect(comboMatches(
                parseKeyCombo("cmd + plus"),
                parseKeyCombo("meta + plus")
            )).to.be.true;
        });

        it("applies aliases", () => {
            expect(comboMatches(
                parseKeyCombo("return"),
                parseKeyCombo("enter")
            )).to.be.true;

            expect(comboMatches(
                parseKeyCombo("win + F"),
                parseKeyCombo("meta + f")
            )).to.be.true;
        });
    });
});
