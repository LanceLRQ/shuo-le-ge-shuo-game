import React from 'react';
import { Theme } from '../interface';
import { DefaultSoundNames, defaultSounds } from '../default';

const imagesUrls = import.meta.glob('./images/*.png', {
    import: 'default',
    eager: true,
});

const fishes = Object.entries(imagesUrls).map(([key, value]) => ({
    name: key.slice(9, -4),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    content: <img src={value} alt="" draggable="false" />,
}));

export const shuoshuoTheme: Theme<DefaultSoundNames> = {
    title: '说了个说',
    name: '说了个说',
    icons: fishes.map(({ name, content }) => ({
        name,
        content,
        clickSound: 'button-click',
        tripleSound: 'triple',
    })),
    sounds: defaultSounds,
};
