import { test, expect } from '@playwright/test';
import { testSetup } from './frontent-test-utils.js';

const LORE_NAMES = ['MULTI_IMPORT_LORE_A', 'MULTI_IMPORT_LORE_B'];
const CHAR_NAMES = ['Multi Import Char A', 'Multi Import Char B'];

/**
 * Builds a minimal native SillyTavern lorebook payload.
 * @param {string} name Lorebook name (used for the entry key)
 * @returns {object} Lorebook JSON
 */
function makeLorebook(name) {
    return {
        entries: {
            '0': {
                uid: 0,
                key: [name.toLowerCase()],
                keysecondary: [],
                comment: `Entry for ${name}`,
                content: `Lorebook content for ${name}`,
                constant: false,
                selective: false,
                order: 100,
                position: 0,
                disable: false,
                excludeRecursion: false,
                probability: 100,
                useProbability: true,
                depth: 4,
            },
        },
    };
}

/**
 * Builds a minimal V2 character card payload.
 * @param {string} name Character name
 * @returns {object} Character card JSON
 */
function makeCharacter(name) {
    return {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name,
            description: `Test character ${name}`,
            personality: '',
            scenario: '',
            first_mes: `Hello from ${name}`,
            mes_example: '',
            creator_notes: '',
            system_prompt: '',
            post_history_instructions: '',
            alternate_greetings: [],
            tags: ['multi-import-test'],
            creator: 'e2e',
            character_version: '1.0',
            extensions: {},
        },
    };
}

/**
 * Removes test lorebooks and characters, before and after each test.
 * @param {import('@playwright/test').Page} page Page
 */
async function cleanup(page) {
    await page.evaluate(async ({ loreNames, charNames }) => {
        const { world_names, deleteWorldInfo, updateWorldInfoList } = await import('./scripts/world-info.js');
        const { characters, getCharacters, getRequestHeaders } = await import('./script.js');

        await updateWorldInfoList();
        for (const name of loreNames) {
            if (world_names.includes(name)) {
                await deleteWorldInfo(name);
            }
        }

        await getCharacters();
        for (const name of charNames) {
            const character = characters.find(c => c.name === name);
            if (character) {
                await fetch('/api/characters/delete', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ avatar_url: character.avatar, delete_chats: true }),
                });
            }
        }
        await getCharacters();
    }, { loreNames: LORE_NAMES, charNames: CHAR_NAMES });
}

/**
 * Waits until every named lorebook exists.
 * @param {import('@playwright/test').Page} page Page
 * @param {string[]} names Lorebook names
 */
async function expectLorebooks(page, names) {
    await expect.poll(async () => {
        return await page.evaluate(async (names) => {
            const { world_names, updateWorldInfoList } = await import('./scripts/world-info.js');
            await updateWorldInfoList();
            return names.every(name => world_names.includes(name));
        }, names);
    }, { timeout: 20000, message: 'Expected all lorebooks to be imported' }).toBe(true);
}

/**
 * Waits until every named character exists.
 * @param {import('@playwright/test').Page} page Page
 * @param {string[]} names Character names
 */
async function expectCharacters(page, names) {
    await expect.poll(async () => {
        return await page.evaluate(async (names) => {
            const { characters, getCharacters } = await import('./script.js');
            await getCharacters();
            return names.every(name => characters.some(c => c.name === name));
        }, names);
    }, { timeout: 20000, message: 'Expected all characters to be imported' }).toBe(true);
}

test.describe('Multi Import', () => {
    test.beforeEach(testSetup.awaitST);
    test.beforeEach(async ({ page }) => await cleanup(page));
    test.afterEach(async ({ page }) => await cleanup(page));

    test('imports multiple lorebooks from the file picker', async ({ page }) => {
        const input = page.locator('#world_import_file');
        await expect(input).toHaveAttribute('multiple', '');

        await input.setInputFiles(LORE_NAMES.map(name => ({
            name: `${name}.json`,
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(makeLorebook(name))),
        })));

        await expectLorebooks(page, LORE_NAMES);
    });

    test('imports multiple characters from the file picker', async ({ page }) => {
        const input = page.locator('#character_import_file');
        await expect(input).toHaveAttribute('multiple', '');

        await input.setInputFiles(CHAR_NAMES.map(name => ({
            name: `${name}.json`,
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(makeCharacter(name))),
        })));

        await expectCharacters(page, CHAR_NAMES);
    });

    test('imports multiple lorebooks dropped onto the window', async ({ page }) => {
        const dataTransfer = await page.evaluateHandle((payloads) => {
            const dt = new DataTransfer();
            for (const { name, json } of payloads) {
                dt.items.add(new File([JSON.stringify(json)], `${name}.json`, { type: 'application/json' }));
            }
            return dt;
        }, LORE_NAMES.map(name => ({ name, json: makeLorebook(name) })));

        await page.dispatchEvent('body', 'drop', { dataTransfer });
        await expectLorebooks(page, LORE_NAMES);

        // Dropped lorebooks must not be misimported as characters
        const charCount = await page.evaluate(async (names) => {
            const { characters, getCharacters } = await import('./script.js');
            await getCharacters();
            return characters.filter(c => names.includes(c.name)).length;
        }, LORE_NAMES);
        expect(charCount).toBe(0);
    });

    test('still imports dropped character cards as characters', async ({ page }) => {
        const dataTransfer = await page.evaluateHandle((payloads) => {
            const dt = new DataTransfer();
            for (const { name, json } of payloads) {
                dt.items.add(new File([JSON.stringify(json)], `${name}.json`, { type: 'application/json' }));
            }
            return dt;
        }, CHAR_NAMES.map(name => ({ name, json: makeCharacter(name) })));

        await page.dispatchEvent('body', 'drop', { dataTransfer });
        await expectCharacters(page, CHAR_NAMES);

        // Character cards must not be misimported as lorebooks
        const loreCount = await page.evaluate(async (names) => {
            const { world_names, updateWorldInfoList } = await import('./scripts/world-info.js');
            await updateWorldInfoList();
            return world_names.filter(name => names.includes(name)).length;
        }, CHAR_NAMES);
        expect(loreCount).toBe(0);
    });
});
